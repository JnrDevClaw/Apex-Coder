# Cost Optimization Resources

# Budget for monthly spending
resource "aws_budgets_budget" "monthly_cost" {
  name         = "${local.name_prefix}-monthly-budget"
  budget_type  = "COST"
  limit_amount = var.monthly_budget_limit
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  
  time_period_start = formatdate("YYYY-MM-01_00:00", timestamp())
  
  cost_filters {
    tag {
      key = "Project"
      values = [var.project_name]
    }
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_email_addresses = [var.notification_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.notification_email]
  }

  tags = local.common_tags
}

# Trusted Advisor Cost Optimization (Enterprise support required)
resource "aws_config_config_rule" "ec2_instance_no_public_ip" {
  count = var.enable_cost_optimization_rules ? 1 : 0
  
  name = "${local.name_prefix}-ec2-no-public-ip"

  source {
    owner             = "AWS"
    source_identifier = "EC2_INSTANCE_NO_PUBLIC_IP"
  }

  depends_on = [aws_config_configuration_recorder.main]

  tags = local.common_tags
}

resource "aws_config_config_rule" "ebs_optimized_instance" {
  count = var.enable_cost_optimization_rules ? 1 : 0
  
  name = "${local.name_prefix}-ebs-optimized-instance"

  source {
    owner             = "AWS"
    source_identifier = "EBS_OPTIMIZED_INSTANCE"
  }

  depends_on = [aws_config_configuration_recorder.main]

  tags = local.common_tags
}

# Lambda function for cost optimization recommendations
resource "aws_lambda_function" "cost_optimizer" {
  count = var.enable_cost_optimization_lambda ? 1 : 0
  
  filename         = "cost_optimizer.zip"
  function_name    = "${local.name_prefix}-cost-optimizer"
  role            = aws_iam_role.cost_optimizer_lambda[0].arn
  handler         = "index.handler"
  runtime         = "python3.9"
  timeout         = 300

  source_code_hash = data.archive_file.cost_optimizer_zip[0].output_base64sha256

  environment {
    variables = {
      SNS_TOPIC_ARN = aws_sns_topic.alerts.arn
      PROJECT_NAME  = var.project_name
      ENVIRONMENT   = var.environment
    }
  }

  tags = local.common_tags
}

# Lambda deployment package
data "archive_file" "cost_optimizer_zip" {
  count = var.enable_cost_optimization_lambda ? 1 : 0
  
  type        = "zip"
  output_path = "cost_optimizer.zip"
  
  source {
    content = templatefile("${path.module}/lambda/cost_optimizer.py", {
      project_name = var.project_name
      environment  = var.environment
    })
    filename = "index.py"
  }
}

# IAM role for cost optimizer Lambda
resource "aws_iam_role" "cost_optimizer_lambda" {
  count = var.enable_cost_optimization_lambda ? 1 : 0
  
  name = "${local.name_prefix}-cost-optimizer-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

# IAM policy for cost optimizer Lambda
resource "aws_iam_role_policy" "cost_optimizer_lambda" {
  count = var.enable_cost_optimization_lambda ? 1 : 0
  
  name = "${local.name_prefix}-cost-optimizer-lambda-policy"
  role = aws_iam_role.cost_optimizer_lambda[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"
      },
      {
        Effect = "Allow"
        Action = [
          "ce:GetCostAndUsage",
          "ce:GetUsageReport",
          "ce:GetReservationCoverage",
          "ce:GetReservationPurchaseRecommendation",
          "ce:GetReservationUtilization",
          "ce:GetSavingsPlansUtilization",
          "ce:GetSavingsPlansUtilizationDetails",
          "ce:ListCostCategoryDefinitions"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:DescribeInstances",
          "ec2:DescribeReservedInstances",
          "ec2:DescribeSpotInstanceRequests",
          "rds:DescribeDBInstances",
          "rds:DescribeReservedDBInstances",
          "elasticache:DescribeCacheClusters",
          "elasticache:DescribeReservedCacheNodes"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = aws_sns_topic.alerts.arn
      }
    ]
  })
}

# CloudWatch Event Rule to trigger cost optimizer weekly
resource "aws_cloudwatch_event_rule" "cost_optimizer_schedule" {
  count = var.enable_cost_optimization_lambda ? 1 : 0
  
  name                = "${local.name_prefix}-cost-optimizer-schedule"
  description         = "Trigger cost optimizer Lambda weekly"
  schedule_expression = "rate(7 days)"

  tags = local.common_tags
}

# CloudWatch Event Target
resource "aws_cloudwatch_event_target" "cost_optimizer_target" {
  count = var.enable_cost_optimization_lambda ? 1 : 0
  
  rule      = aws_cloudwatch_event_rule.cost_optimizer_schedule[0].name
  target_id = "CostOptimizerTarget"
  arn       = aws_lambda_function.cost_optimizer[0].arn
}

# Lambda permission for CloudWatch Events
resource "aws_lambda_permission" "allow_cloudwatch_cost_optimizer" {
  count = var.enable_cost_optimization_lambda ? 1 : 0
  
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cost_optimizer[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.cost_optimizer_schedule[0].arn
}

# S3 bucket lifecycle policies for cost optimization
resource "aws_s3_bucket_intelligent_tiering_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  name   = "EntireBucket"

  status = "Enabled"

  tiering {
    access_tier = "DEEP_ARCHIVE_ACCESS"
    days        = 180
  }

  tiering {
    access_tier = "ARCHIVE_ACCESS"
    days        = 90
  }
}

resource "aws_s3_bucket_intelligent_tiering_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  name   = "EntireBucket"

  status = "Enabled"

  tiering {
    access_tier = "DEEP_ARCHIVE_ACCESS"
    days        = 90
  }

  tiering {
    access_tier = "ARCHIVE_ACCESS"
    days        = 30
  }
}

# CloudWatch Log Group retention optimization
resource "aws_cloudwatch_log_group" "cost_optimizer" {
  count = var.enable_cost_optimization_lambda ? 1 : 0
  
  name              = "/aws/lambda/${aws_lambda_function.cost_optimizer[0].function_name}"
  retention_in_days = 14

  tags = local.common_tags
}