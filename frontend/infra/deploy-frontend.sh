#!/usr/bin/env bash
set -euo pipefail

# Linear, idempotent deploy: build → S3 → OAC → ACM → CloudFront → Route53.
# Usage: cd frontend && ./infra/deploy-frontend.sh

# ------- Editable defaults -------
REGION=${AWS_REGION:-eu-west-1}
BUCKET=${BUCKET:-certshack-examapp-www}
CLOUDFRONT_DIST=${CLOUDFRONT_DIST:-}
DOMAIN=${DOMAIN:-certshack.com}
WWW_DOMAIN="www.${DOMAIN}"
ACM_REGION="us-east-1"                    # CloudFront requires certs in us-east-1
# ----------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=========================================="
echo "Deploying frontend  →  S3 + CloudFront"
echo "  region=$REGION  bucket=$BUCKET  domain=$DOMAIN"
echo "=========================================="

cd "$ROOT_DIR"

# ── 1) Verify tooling ──────────────────────────────────────────────
echo "1) Verify tooling"
for cmd in pnpm aws jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "$cmd not found — install it before running this script."; exit 1
  fi
done

# ── 2) Build site ──────────────────────────────────────────────────
echo "2) Build site"
pnpm install --frozen-lockfile
pnpm run build
if [[ ! -d dist ]]; then
  echo "ERROR: dist/ directory not found after build. Check your Vite config."; exit 1
fi

# ── 3) Ensure S3 bucket exists ─────────────────────────────────────
echo "3) Ensure S3 bucket exists"
if ! aws s3api head-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null 2>&1; then
  echo "   Creating S3 bucket $BUCKET in $REGION"
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" || true
  aws s3api put-bucket-versioning --bucket "$BUCKET" \
    --versioning-configuration Status=Enabled || true
  aws s3api put-public-access-block --bucket "$BUCKET" \
    --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false || true
fi

# ── 4) Sync dist/ to S3 ───────────────────────────────────────────
echo "4) Sync dist/ → s3://$BUCKET"
aws s3 sync dist/ "s3://$BUCKET" --delete

# ── 5) CloudFront Origin Access Control (OAC) ─────────────────────
echo "5) Ensure CloudFront Origin Access Control (OAC)"
OAC_NAME="certshack-examapp-oac"
OAC_ID=$(aws cloudfront list-origin-access-controls \
  --query "OriginAccessControlList.Items[?Name=='$OAC_NAME'].Id | [0]" \
  --output text 2>/dev/null || true)
if [[ -z "$OAC_ID" || "$OAC_ID" == "None" ]]; then
  echo "   Creating OAC '$OAC_NAME'"
  OAC_JSON=$(aws cloudfront create-origin-access-control \
    --origin-access-control-config "{\"Name\":\"$OAC_NAME\",\"Description\":\"OAC for $BUCKET S3 bucket\",\"SigningProtocol\":\"sigv4\",\"SigningBehavior\":\"always\",\"OriginAccessControlOriginType\":\"s3\"}")
  OAC_ID=$(echo "$OAC_JSON" | jq -r '.OriginAccessControl.Id')
fi
echo "   OAC_ID=$OAC_ID"

# ── 6) S3 bucket policy for OAC ───────────────────────────────────
echo "6) Apply S3 bucket policy for OAC"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
# Note: bucket policy references the distribution ARN. On first run
# (distribution not yet created) we defer the policy to after step 10.
# On subsequent runs CLOUDFRONT_DIST is set and we apply it now.
if [[ -n "$CLOUDFRONT_DIST" ]]; then
  POLICY_JSON=$(cat <<EOF
{
  "Version":"2012-10-17",
  "Statement":[{
    "Sid":"AllowCloudFrontOAC",
    "Effect":"Allow",
    "Principal":{"Service":"cloudfront.amazonaws.com"},
    "Action":"s3:GetObject",
    "Resource":"arn:aws:s3:::$BUCKET/*",
    "Condition":{"StringEquals":{"AWS:SourceArn":"arn:aws:cloudfront::$ACCOUNT_ID:distribution/$CLOUDFRONT_DIST"}}
  }]
}
EOF
)
  aws s3api put-bucket-policy --bucket "$BUCKET" --policy "$POLICY_JSON" || true
else
  echo "   (deferred — distribution not yet created)"
fi

# ── 7) ACM certificate in us-east-1 ───────────────────────────────
echo "7) Ensure ACM certificate in $ACM_REGION for $DOMAIN + $WWW_DOMAIN"
CERT_ARN=$(aws acm list-certificates --region "$ACM_REGION" \
  --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn | [0]" \
  --output text 2>/dev/null || true)
if [[ -n "$CERT_ARN" && "$CERT_ARN" != "None" ]]; then
  echo "   Found existing certificate: $CERT_ARN"
else
  echo "   Requesting new certificate"
  REQ_JSON=$(aws acm request-certificate --region "$ACM_REGION" \
    --domain-name "$DOMAIN" --subject-alternative-names "$WWW_DOMAIN" \
    --validation-method DNS)
  CERT_ARN=$(echo "$REQ_JSON" | jq -r '.CertificateArn')
  echo "   Requested: $CERT_ARN"
  # short pause so describe-certificate returns validation options
  sleep 5
fi

# ── 8) DNS validation records in Route53 ──────────────────────────
echo "8) Create DNS validation records in Route53"
HOSTED_ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name "$DOMAIN" \
  --query 'HostedZones[0].Id' --output text || true)
HOSTED_ZONE_ID=${HOSTED_ZONE_ID##*/}
if [[ -z "$HOSTED_ZONE_ID" || "$HOSTED_ZONE_ID" == "None" ]]; then
  echo "   No hosted zone for $DOMAIN — create CNAME validation records manually."
else
  echo "   Hosted zone: $HOSTED_ZONE_ID"
  VALIDATION_JSON=$(aws acm describe-certificate --certificate-arn "$CERT_ARN" \
    --region "$ACM_REGION" --query 'Certificate.DomainValidationOptions' --output json)
  echo "$VALIDATION_JSON" | jq -c '.[]' | while read -r rr; do
    NAME=$(echo "$rr" | jq -r '.ResourceRecord.Name // empty')
    VALUE=$(echo "$rr" | jq -r '.ResourceRecord.Value // empty')
    TYPE=$(echo "$rr" | jq -r '.ResourceRecord.Type // empty')
    [[ -z "$NAME" || -z "$VALUE" ]] && continue
    echo "   UPSERT $TYPE $NAME → $VALUE"
    CHANGE_BATCH=$(cat <<INNEREOF
{"Comment":"ACM validation","Changes":[{"Action":"UPSERT","ResourceRecordSet":{"Name":"$NAME","Type":"$TYPE","TTL":300,"ResourceRecords":[{"Value":"$VALUE"}]}}]}
INNEREOF
)
    aws route53 change-resource-record-sets --hosted-zone-id "$HOSTED_ZONE_ID" \
      --change-batch "$CHANGE_BATCH" >/dev/null
  done
fi

# ── 9) Wait for certificate ISSUED ────────────────────────────────
echo "9) Waiting for ACM certificate to be ISSUED (up to 15 min)"
MAX_WAIT=900; INTERVAL=15; elapsed=0
while true; do
  STATUS=$(aws acm describe-certificate --certificate-arn "$CERT_ARN" \
    --region "$ACM_REGION" --query 'Certificate.Status' --output text || true)
  echo "   status: $STATUS  (${elapsed}s elapsed)"
  [[ "$STATUS" == "ISSUED" ]] && break
  [[ "$STATUS" == "FAILED" ]] && { echo "Certificate FAILED"; exit 1; }
  [[ $elapsed -ge $MAX_WAIT ]] && { echo "Timed out waiting for cert"; exit 1; }
  sleep $INTERVAL
  elapsed=$((elapsed + INTERVAL))
done

# ── 10) CloudFront distribution ────────────────────────────────────
echo "10) Ensure CloudFront distribution for $DOMAIN / $WWW_DOMAIN"
# Look up existing distribution by alias
EXISTING_DIST_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Aliases.Items[?@=='$DOMAIN']].Id | [0]" \
  --output text 2>/dev/null || true)
if [[ -n "$EXISTING_DIST_ID" && "$EXISTING_DIST_ID" != "None" ]]; then
  echo "   Found existing distribution: $EXISTING_DIST_ID"
  CLOUDFRONT_DIST="$EXISTING_DIST_ID"
else
  echo "   Creating CloudFront distribution"
  TEMP_CONFIG=$(mktemp /tmp/dist-config.XXXX.json)
  cat > "$TEMP_CONFIG" <<EOF
{
  "CallerReference": "examapp-$(date +%s)",
  "Comment": "certshack examapp frontend",
  "Enabled": true,
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "S3-$BUCKET",
      "DomainName": "$BUCKET.s3.$REGION.amazonaws.com",
      "OriginAccessControlId": "$OAC_ID",
      "S3OriginConfig": {
        "OriginAccessIdentity": ""
      }
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-$BUCKET",
    "ViewerProtocolPolicy": "redirect-to-https",
    "Compress": true,
    "AllowedMethods": { "Quantity": 2, "Items": ["GET","HEAD"], "CachedMethods": { "Quantity": 2, "Items": ["GET","HEAD"] } },
    "ForwardedValues": { "QueryString": false, "Cookies": { "Forward": "none" } },
    "MinTTL": 0,
    "DefaultTTL": 3600,
    "MaxTTL": 86400
  },
  "CustomErrorResponses": {
    "Quantity": 2,
    "Items": [
      { "ErrorCode": 403, "ResponsePagePath": "/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 10 },
      { "ErrorCode": 404, "ResponsePagePath": "/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 10 }
    ]
  },
  "Aliases": { "Quantity": 2, "Items": ["$DOMAIN","$WWW_DOMAIN"] },
  "ViewerCertificate": {
    "ACMCertificateArn": "$CERT_ARN",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021"
  },
  "HttpVersion": "http2and3",
  "PriceClass": "PriceClass_100"
}
EOF
  CREATE_OUT=$(aws cloudfront create-distribution --distribution-config file://"$TEMP_CONFIG")
  CLOUDFRONT_DIST=$(echo "$CREATE_OUT" | jq -r '.Distribution.Id')
  DIST_DOMAIN=$(echo "$CREATE_OUT" | jq -r '.Distribution.DomainName')
  rm -f "$TEMP_CONFIG"
  echo "   Created: $CLOUDFRONT_DIST ($DIST_DOMAIN)"

  # Apply deferred bucket policy now that we have the distribution ID
  echo "   Applying S3 bucket policy for OAC"
  POLICY_JSON=$(cat <<BPEOF
{
  "Version":"2012-10-17",
  "Statement":[{
    "Sid":"AllowCloudFrontOAC",
    "Effect":"Allow",
    "Principal":{"Service":"cloudfront.amazonaws.com"},
    "Action":"s3:GetObject",
    "Resource":"arn:aws:s3:::$BUCKET/*",
    "Condition":{"StringEquals":{"AWS:SourceArn":"arn:aws:cloudfront::$ACCOUNT_ID:distribution/$CLOUDFRONT_DIST"}}
  }]
}
BPEOF
)
  aws s3api put-bucket-policy --bucket "$BUCKET" --policy "$POLICY_JSON" || true

  echo "   Waiting for distribution to deploy (can take 5-15 min)..."
  elapsed=0; MAX_WAIT=1800; INTERVAL=30
  while true; do
    ST=$(aws cloudfront get-distribution --id "$CLOUDFRONT_DIST" \
      --query 'Distribution.Status' --output text || true)
    echo "   status: $ST  (${elapsed}s)"
    [[ "$ST" == "Deployed" ]] && break
    [[ $elapsed -ge $MAX_WAIT ]] && { echo "Timed out waiting for CF deploy"; break; }
    sleep $INTERVAL
    elapsed=$((elapsed + INTERVAL))
  done
fi

# ── 11) Route53 alias records ──────────────────────────────────────
echo "11) Route53 alias records → CloudFront"
DIST_DOMAIN=$(aws cloudfront get-distribution --id "$CLOUDFRONT_DIST" \
  --query 'Distribution.DomainName' --output text)
CF_HOSTED_ZONE_ID="Z2FDTNDATAQYW2"   # fixed CloudFront hosted zone id
if [[ -z "$HOSTED_ZONE_ID" || "$HOSTED_ZONE_ID" == "None" ]]; then
  HOSTED_ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name "$DOMAIN" \
    --query 'HostedZones[0].Id' --output text || true)
  HOSTED_ZONE_ID=${HOSTED_ZONE_ID##*/}
fi
if [[ -n "$HOSTED_ZONE_ID" && "$HOSTED_ZONE_ID" != "None" ]]; then
  echo "   Upserting A-alias for $DOMAIN and $WWW_DOMAIN → $DIST_DOMAIN"
  CHANGE_BATCH=$(cat <<EOF
{"Comment":"CloudFront alias","Changes":[
  {"Action":"UPSERT","ResourceRecordSet":{"Name":"$DOMAIN.","Type":"A","AliasTarget":{"HostedZoneId":"$CF_HOSTED_ZONE_ID","DNSName":"$DIST_DOMAIN","EvaluateTargetHealth":false}}},
  {"Action":"UPSERT","ResourceRecordSet":{"Name":"$WWW_DOMAIN.","Type":"A","AliasTarget":{"HostedZoneId":"$CF_HOSTED_ZONE_ID","DNSName":"$DIST_DOMAIN","EvaluateTargetHealth":false}}}
]}
EOF
)
  aws route53 change-resource-record-sets --hosted-zone-id "$HOSTED_ZONE_ID" \
    --change-batch "$CHANGE_BATCH" >/dev/null
  echo "   Done."
else
  echo "   No hosted zone for $DOMAIN — create alias records manually → $DIST_DOMAIN"
fi

# ── 12) Invalidate CloudFront cache ───────────────────────────────
echo "12) Invalidate CloudFront cache"
aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_DIST" --paths "/*" >/dev/null
echo "   Invalidation requested."

echo ""
echo "=========================================="
echo "All done!"
echo "  CloudFront ID : $CLOUDFRONT_DIST"
echo "  CloudFront URL: https://$DIST_DOMAIN"
echo "  Domain        : https://$DOMAIN"
echo ""
echo "To skip provisioning on future deploys, export:"
echo "  export CLOUDFRONT_DIST=$CLOUDFRONT_DIST"
echo "=========================================="

exit 0

