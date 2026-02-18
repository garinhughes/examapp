#!/usr/bin/env bash
set -euo pipefail

# Simple helper to create / remove a temporary WAF allowlist Web ACL
# Usage:
#   ./waf-allowlist.sh create <CLOUDFRONT_DISTRIBUTION_ID> [MY_IP]
#   ./waf-allowlist.sh delete
#
# The script stores state in `./infra/waf-allowlist-state.json`.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_FILE="$SCRIPT_DIR/waf-allowlist-state.json"

AWS_REGION_US_EAST="us-east-1"  # WAF (CLOUDFRONT) is managed in us-east-1

IPSET_NAME="certshack-allowlist"
WEB_ACL_NAME="certshack-temp-acl"

usage() {
  cat <<EOF
Usage: $0 create [CLOUDFRONT_DIST_ID] [MY_IP]
       $0 delete

create: creates an IP set + Web ACL (default block) allowing only MY_IP and associates it with the CloudFront distribution
        If CLOUDFRONT_DIST_ID is omitted the script will try to auto-detect the distribution for certshack.com.
delete: disassociates and deletes the Web ACL and IP set using saved state or auto-detected distribution

MY_IP may be an IPv4 address (e.g. 1.2.3.4) or CIDR. If omitted on create we attempt to detect your public IP.
EOF
}

detect_my_ip() {
  echo "$(curl -s https://ifconfig.co)" || true
}

detect_distribution() {
  # Try to find a CloudFront distribution that serves certshack.com or the known S3 origin
  DIST_ID=$(aws cloudfront list-distributions --output json 2>/dev/null | jq -r '.DistributionList.Items[] | select((.Aliases.Items[]? == "certshack.com") or (.Aliases.Items[]? == "www.certshack.com") or (.Origins.Items[]?.DomainName | test("certshack-examapp-www"))) | .Id' | head -n1)
  if [[ -z "$DIST_ID" || "$DIST_ID" == "null" ]]; then
    DIST_ID=""
  fi
}

save_state() {
  jq -n --arg ipset_id "$IPSET_ID" --arg ipset_arn "$IPSET_ARN" --arg web_acl_id "$WEB_ACL_ID" --arg web_acl_arn "$WEB_ACL_ARN" --arg dist_id "$DIST_ID" '{IPSetId:$ipset_id,IPSetArn:$ipset_arn,WebACLId:$web_acl_id,WebACLArn:$web_acl_arn,DistributionId:$dist_id}' > "$STATE_FILE"
}

load_state() {
  if [[ -f "$STATE_FILE" ]]; then
    IPSET_ID=$(jq -r '.IPSetId // empty' "$STATE_FILE")
    IPSET_ARN=$(jq -r '.IPSetArn // empty' "$STATE_FILE")
    WEB_ACL_ID=$(jq -r '.WebACLId // empty' "$STATE_FILE")
    WEB_ACL_ARN=$(jq -r '.WebACLArn // empty' "$STATE_FILE")
    DIST_ID=$(jq -r '.DistributionId // empty' "$STATE_FILE")
  fi
}

cmd=${1:-}
case "$cmd" in
  create)
    DIST_ID=${2:-}
    MY_IP=${3:-}
    if [[ -z "$DIST_ID" ]]; then
      echo "No distribution id provided, attempting to auto-detect..."
      detect_distribution
      if [[ -z "$DIST_ID" ]]; then
        echo "Unable to auto-detect CloudFront distribution; supply it as the first arg"; exit 1
      fi
      echo "Auto-detected distribution id: $DIST_ID"
    fi

    if [[ -z "$MY_IP" ]]; then
      echo "Detecting your public IP..."
      MY_IP=$(detect_my_ip)
    fi
    if [[ -z "$MY_IP" ]]; then
      echo "Unable to determine MY_IP; provide it as third arg"; exit 1
    fi
    # ensure CIDR suffix
    if [[ "$MY_IP" != */* ]]; then
      MY_IP="$MY_IP/32"
    fi

    echo "Creating IP set for $MY_IP (scope CLOUDFRONT) on distribution $DIST_ID"
    # check existing
    EXISTING_IPSET_ID=$(aws wafv2 list-ip-sets --scope CLOUDFRONT --region "$AWS_REGION_US_EAST" --query "IPSets[?Name=='$IPSET_NAME'].Id | [0]" --output text || true)
    if [[ -n "$EXISTING_IPSET_ID" && "$EXISTING_IPSET_ID" != "None" ]]; then
      echo "Found existing IP set: $EXISTING_IPSET_ID"
      IPSET_ID="$EXISTING_IPSET_ID"
      IPSET_ARN=$(aws wafv2 get-ip-set --id "$IPSET_ID" --name "$IPSET_NAME" --scope CLOUDFRONT --region "$AWS_REGION_US_EAST" --query 'IPSet.ARN' --output text)
    else
      OUTF=$(aws wafv2 create-ip-set --name "$IPSET_NAME" --scope CLOUDFRONT --ip-address-version IPV4 --addresses "$MY_IP" --description "Temporary allowlist for certshack" --region "$AWS_REGION_US_EAST")
      IPSET_ID=$(echo "$OUTF" | jq -r '.Summary.Id')
      IPSET_ARN=$(echo "$OUTF" | jq -r '.Summary.ARN')
      echo "Created IP set: $IPSET_ID"
    fi

    echo "Creating Web ACL (default Block, allow only IP set)"
    EXISTING_WEBACL_ID=$(aws wafv2 list-web-acls --scope CLOUDFRONT --region "$AWS_REGION_US_EAST" --query "WebACLs[?Name=='$WEB_ACL_NAME'].Id | [0]" --output text || true)
    if [[ -n "$EXISTING_WEBACL_ID" && "$EXISTING_WEBACL_ID" != "None" ]]; then
      echo "Found existing Web ACL: $EXISTING_WEBACL_ID"
      WEB_ACL_ID="$EXISTING_WEBACL_ID"
      WEB_ACL_ARN=$(aws wafv2 get-web-acl --name "$WEB_ACL_NAME" --scope CLOUDFRONT --id "$WEB_ACL_ID" --region "$AWS_REGION_US_EAST" --query 'WebACL.ARN' --output text)
    else
      TMP_JSON=$(mktemp /tmp/waf-acl.XXXX.json)
      cat > "$TMP_JSON" <<EOF
{
  "Name": "$WEB_ACL_NAME",
  "Scope": "CLOUDFRONT",
  "DefaultAction": { "Block": {} },
  "VisibilityConfig": { "SampledRequestsEnabled": true, "CloudWatchMetricsEnabled": true, "MetricName": "certshackTempAcl" },
  "Rules": [
    {
      "Name": "AllowListedIPs",
      "Priority": 0,
      "Action": { "Allow": {} },
      "Statement": { "IPSetReferenceStatement": { "ARN": "$IPSET_ARN" } },
      "VisibilityConfig": { "SampledRequestsEnabled": true, "CloudWatchMetricsEnabled": true, "MetricName": "allowListedIPs" }
    }
  ]
}
EOF
      OUTW=$(aws wafv2 create-web-acl --cli-input-json file://"$TMP_JSON" --region "$AWS_REGION_US_EAST")
      WEB_ACL_ID=$(echo "$OUTW" | jq -r '.Summary.Id')
      WEB_ACL_ARN=$(echo "$OUTW" | jq -r '.Summary.ARN')
      rm -f "$TMP_JSON"
      echo "Created Web ACL: $WEB_ACL_ID"
    fi

    echo "Associating Web ACL with CloudFront distribution $DIST_ID via CloudFront UpdateDistribution (required for CloudFront)"
    TMP=$(mktemp /tmp/cf-dist.XXXX.json)
    META=$(aws cloudfront get-distribution-config --id "$DIST_ID" --output json)
    ETAG=$(echo "$META" | jq -r '.ETag')
    echo "$META" | jq '.DistributionConfig' > "$TMP"
    # set WebACLId to the web ACL ARN
    jq --arg wacl "$WEB_ACL_ARN" '. + {WebACLId:$wacl}' "$TMP" > "${TMP}.new" && mv "${TMP}.new" "$TMP"
    aws cloudfront update-distribution --id "$DIST_ID" --if-match "$ETAG" --distribution-config file://"$TMP"
    rm -f "$TMP"

    # save state
    save_state
    echo "Created and associated WAF allowlist. State written to $STATE_FILE"
    ;;

  delete)
    load_state
    if [[ -z "${WEB_ACL_ID:-}" || -z "${IPSET_ID:-}" ]]; then
      echo "No state found in $STATE_FILE; attempting to discover resources by name"
      WEB_ACL_ID=$(aws wafv2 list-web-acls --scope CLOUDFRONT --region "$AWS_REGION_US_EAST" --query "WebACLs[?Name=='$WEB_ACL_NAME'].Id | [0]" --output text || true)
      IPSET_ID=$(aws wafv2 list-ip-sets --scope CLOUDFRONT --region "$AWS_REGION_US_EAST" --query "IPSets[?Name=='$IPSET_NAME'].Id | [0]" --output text || true)
      if [[ -z "$WEB_ACL_ID" || -z "$IPSET_ID" || "$WEB_ACL_ID" == "None" || "$IPSET_ID" == "None" ]]; then
        echo "Unable to find Web ACL or IP set; nothing to delete"; exit 0
      fi
    fi

    echo "Disassociating Web ACL from distribution"
    # if state contains DistributionId, use it; otherwise attempt to auto-detect
    if [[ -z "${DIST_ID:-}" || "${DIST_ID}" == "" ]]; then
      DIST_ID=$(jq -r '.DistributionId // empty' "$STATE_FILE" 2>/dev/null || true)
    fi
    if [[ -z "${DIST_ID:-}" || "${DIST_ID}" == "" ]]; then
      echo "No distribution id in state, attempting to auto-detect..."
      detect_distribution
      if [[ -z "$DIST_ID" ]]; then
        echo "Unable to determine distribution id; proceed with resource deletion only";
      else
        echo "Auto-detected distribution id: $DIST_ID"
      fi
    fi
    if [[ -n "${DIST_ID:-}" && "${DIST_ID}" != "" ]]; then
      echo "Removing Web ACL from CloudFront distribution $DIST_ID via UpdateDistribution"
      TMP=$(mktemp /tmp/cf-dist.XXXX.json)
      META=$(aws cloudfront get-distribution-config --id "$DIST_ID" --output json)
      ETAG=$(echo "$META" | jq -r '.ETag')
      echo "$META" | jq '.DistributionConfig' > "$TMP"
      # remove WebACLId (set to empty string)
      jq '. + {WebACLId:""}' "$TMP" > "${TMP}.new" && mv "${TMP}.new" "$TMP"
      aws cloudfront update-distribution --id "$DIST_ID" --if-match "$ETAG" --distribution-config file://"$TMP" || true
      rm -f "$TMP"
    else
      echo "No distribution ID available; skipping disassociation"
    fi

    echo "Deleting Web ACL $WEB_ACL_ID"
    # need lock token
    WEB_LOCK=$(aws wafv2 get-web-acl --name "$WEB_ACL_NAME" --scope CLOUDFRONT --id "$WEB_ACL_ID" --region "$AWS_REGION_US_EAST" --query 'LockToken' --output text)
    aws wafv2 delete-web-acl --name "$WEB_ACL_NAME" --scope CLOUDFRONT --id "$WEB_ACL_ID" --lock-token "$WEB_LOCK" --region "$AWS_REGION_US_EAST" || true

    echo "Deleting IP set $IPSET_ID"
    IP_LOCK=$(aws wafv2 get-ip-set --name "$IPSET_NAME" --scope CLOUDFRONT --id "$IPSET_ID" --region "$AWS_REGION_US_EAST" --query 'LockToken' --output text)
    aws wafv2 delete-ip-set --name "$IPSET_NAME" --scope CLOUDFRONT --id "$IPSET_ID" --lock-token "$IP_LOCK" --region "$AWS_REGION_US_EAST" || true

    echo "Removing state file $STATE_FILE"
    rm -f "$STATE_FILE" || true
    ;;

  *)
    usage; exit 1
    ;;
esac
