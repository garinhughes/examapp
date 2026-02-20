import os
import boto3
import logging

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

TABLES = os.environ.get("TABLES", "").split(",")
NAMESPACE = os.environ.get("NAMESPACE", "examapp/DynamoDB")

_dynamodb = boto3.client("dynamodb")
_cloudwatch = boto3.client("cloudwatch")


def scan_count(table_name):
    """Return accurate item count using paginated Scan Select=COUNT."""
    total = 0
    paginator = _dynamodb.get_paginator('scan')
    try:
        for page in paginator.paginate(TableName=table_name, Select='COUNT'):
            total += int(page.get('Count', 0))
    except Exception:
        # fallback - try single scan
        resp = _dynamodb.scan(TableName=table_name, Select='COUNT')
        total = int(resp.get('Count', 0))
    return total


def publish_counts():
    metric_data = []
    for table in TABLES:
        table = table.strip()
        if not table:
            continue
        try:
            count = scan_count(table)
            log.info("Table %s scan count=%d", table, count)
            metric_data.append({
                'MetricName': 'ItemCount',
                'Dimensions': [{'Name': 'TableName', 'Value': table}],
                'Value': count,
                'Unit': 'Count'
            })
        except Exception as e:
            log.exception("scan_count failed for %s: %s", table, e)

    # publish in batches of 20
    try:
        for i in range(0, len(metric_data), 20):
            batch = metric_data[i:i+20]
            _cloudwatch.put_metric_data(Namespace=NAMESPACE, MetricData=batch)
        return True
    except Exception as e:
        log.exception("PutMetricData failed: %s", e)
        return False


def lambda_handler(event, context):
    if not TABLES or TABLES == [""]:
        log.info("No tables configured in TABLES env var")
        return {"status": "no-tables"}

    ok = publish_counts()
    return {"status": "ok" if ok else "error"}
