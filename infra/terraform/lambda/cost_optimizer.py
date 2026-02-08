import json
import boto3
import os
from datetime import datetime, timedelta
from decimal import Decimal

def handler(event, context):
    """
    Lambda function to analyze costs and provide optimization recommendations
    """
    
    # Initialize AWS clients
    ce_client = boto3.client('ce')
    ec2_client = boto3.client('ec2')
    rds_client = boto3.client('rds')
    sns_client = boto3.client('sns')
    
    project_name = os.environ['PROJECT_NAME']
    environment = os.environ['ENVIRONMENT']
    sns_topic_arn = os.environ['SNS_TOPIC_ARN']
    
    recommendations = []
    
    try:
        # Get cost data for the last 30 days
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=30)
        
        cost_response = ce_client.get_cost_and_usage(
            TimePeriod={
                'Start': start_date.strftime('%Y-%m-%d'),
                'End': end_date.strftime('%Y-%m-%d')
            },
            Granularity='MONTHLY',
            Metrics=['BlendedCost'],
            GroupBy=[
                {
                    'Type': 'DIMENSION',
                    'Key': 'SERVICE'
                }
            ],
            Filter={
                'Tags': {
                    'Key': 'Project',
                    'Values': [project_name]
                }
            }
        )
        
        # Analyze costs by service
        service_costs = {}
        total_cost = Decimal('0')
        
        for result in cost_response['ResultsByTime']:
            for group in result['Groups']:
                service = group['Keys'][0]
                cost = Decimal(group['Metrics']['BlendedCost']['Amount'])
                service_costs[service] = service_costs.get(service, Decimal('0')) + cost
                total_cost += cost
        
        # Generate recommendations based on cost analysis
        recommendations.extend(analyze_ec2_costs(ec2_client, service_costs))
        recommendations.extend(analyze_rds_costs(rds_client, service_costs))
        recommendations.extend(analyze_storage_costs(service_costs))
        
        # Check for unused resources
        recommendations.extend(check_unused_resources(ec2_client, rds_client))
        
        # Generate report
        report = generate_cost_report(service_costs, total_cost, recommendations)
        
        # Send notification if there are recommendations
        if recommendations:
            send_notification(sns_client, sns_topic_arn, report, project_name, environment)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Cost optimization analysis completed',
                'total_cost': float(total_cost),
                'recommendations_count': len(recommendations)
            })
        }
        
    except Exception as e:
        print(f"Error in cost optimization analysis: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e)
            })
        }

def analyze_ec2_costs(ec2_client, service_costs):
    """Analyze EC2 costs and provide recommendations"""
    recommendations = []
    
    ec2_cost = service_costs.get('Amazon Elastic Compute Cloud - Compute', Decimal('0'))
    
    if ec2_cost > Decimal('100'):  # If EC2 costs are significant
        try:
            # Get running instances
            instances = ec2_client.describe_instances(
                Filters=[
                    {'Name': 'instance-state-name', 'Values': ['running']},
                    {'Name': 'tag:Project', 'Values': ['${project_name}']}
                ]
            )
            
            for reservation in instances['Reservations']:
                for instance in reservation['Instances']:
                    instance_type = instance['InstanceType']
                    
                    # Check for oversized instances (basic heuristic)
                    if instance_type.startswith('m5.large') or instance_type.startswith('m5.xlarge'):
                        recommendations.append({
                            'type': 'EC2_RIGHTSIZING',
                            'resource': instance['InstanceId'],
                            'current_type': instance_type,
                            'recommendation': 'Consider downsizing to m5.medium if CPU utilization is consistently low',
                            'potential_savings': 'Up to 50% cost reduction'
                        })
                    
                    # Check for Spot instance opportunities
                    if instance.get('SpotInstanceRequestId') is None:
                        recommendations.append({
                            'type': 'EC2_SPOT_INSTANCES',
                            'resource': instance['InstanceId'],
                            'recommendation': 'Consider using Spot instances for non-critical workloads',
                            'potential_savings': 'Up to 70% cost reduction'
                        })
                        
        except Exception as e:
            print(f"Error analyzing EC2 costs: {str(e)}")
    
    return recommendations

def analyze_rds_costs(rds_client, service_costs):
    """Analyze RDS costs and provide recommendations"""
    recommendations = []
    
    rds_cost = service_costs.get('Amazon Relational Database Service', Decimal('0'))
    
    if rds_cost > Decimal('50'):  # If RDS costs are significant
        try:
            # Get RDS instances
            db_instances = rds_client.describe_db_instances()
            
            for db_instance in db_instances['DBInstances']:
                db_class = db_instance['DBInstanceClass']
                
                # Check for oversized instances
                if 'large' in db_class or 'xlarge' in db_class:
                    recommendations.append({
                        'type': 'RDS_RIGHTSIZING',
                        'resource': db_instance['DBInstanceIdentifier'],
                        'current_class': db_class,
                        'recommendation': 'Monitor CPU and memory utilization to determine if downsizing is possible',
                        'potential_savings': 'Up to 40% cost reduction'
                    })
                
                # Check backup retention
                backup_retention = db_instance.get('BackupRetentionPeriod', 0)
                if backup_retention > 7:
                    recommendations.append({
                        'type': 'RDS_BACKUP_OPTIMIZATION',
                        'resource': db_instance['DBInstanceIdentifier'],
                        'current_retention': f"{backup_retention} days",
                        'recommendation': 'Consider reducing backup retention period if not required for compliance',
                        'potential_savings': 'Reduce backup storage costs'
                    })
                        
        except Exception as e:
            print(f"Error analyzing RDS costs: {str(e)}")
    
    return recommendations

def analyze_storage_costs(service_costs):
    """Analyze storage costs and provide recommendations"""
    recommendations = []
    
    s3_cost = service_costs.get('Amazon Simple Storage Service', Decimal('0'))
    ebs_cost = service_costs.get('Amazon Elastic Block Store', Decimal('0'))
    
    if s3_cost > Decimal('20'):
        recommendations.append({
            'type': 'S3_LIFECYCLE_OPTIMIZATION',
            'recommendation': 'Implement S3 lifecycle policies to transition old objects to cheaper storage classes',
            'potential_savings': 'Up to 60% on storage costs for infrequently accessed data'
        })
    
    if ebs_cost > Decimal('30'):
        recommendations.append({
            'type': 'EBS_OPTIMIZATION',
            'recommendation': 'Review EBS volumes for unused or oversized volumes, consider gp3 over gp2',
            'potential_savings': 'Up to 20% on EBS costs'
        })
    
    return recommendations

def check_unused_resources(ec2_client, rds_client):
    """Check for unused resources that could be terminated"""
    recommendations = []
    
    try:
        # Check for stopped EC2 instances
        stopped_instances = ec2_client.describe_instances(
            Filters=[
                {'Name': 'instance-state-name', 'Values': ['stopped']},
                {'Name': 'tag:Project', 'Values': ['${project_name}']}
            ]
        )
        
        for reservation in stopped_instances['Reservations']:
            for instance in reservation['Instances']:
                recommendations.append({
                    'type': 'UNUSED_EC2_INSTANCE',
                    'resource': instance['InstanceId'],
                    'recommendation': 'Consider terminating long-stopped instances if no longer needed',
                    'potential_savings': 'Eliminate EBS storage costs'
                })
        
        # Check for unattached EBS volumes
        volumes = ec2_client.describe_volumes(
            Filters=[
                {'Name': 'status', 'Values': ['available']},
                {'Name': 'tag:Project', 'Values': ['${project_name}']}
            ]
        )
        
        for volume in volumes['Volumes']:
            recommendations.append({
                'type': 'UNATTACHED_EBS_VOLUME',
                'resource': volume['VolumeId'],
                'size': f"{volume['Size']} GB",
                'recommendation': 'Delete unattached EBS volumes if no longer needed',
                'potential_savings': f"${float(volume['Size']) * 0.10:.2f}/month"
            })
            
    except Exception as e:
        print(f"Error checking unused resources: {str(e)}")
    
    return recommendations

def generate_cost_report(service_costs, total_cost, recommendations):
    """Generate a formatted cost report"""
    
    report = f"""
Cost Optimization Report for ${project_name} (${environment})
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

COST SUMMARY (Last 30 days):
Total Cost: ${float(total_cost):.2f}

Top Services by Cost:
"""
    
    # Sort services by cost
    sorted_services = sorted(service_costs.items(), key=lambda x: x[1], reverse=True)
    
    for service, cost in sorted_services[:5]:
        percentage = (cost / total_cost * 100) if total_cost > 0 else 0
        report += f"  • {service}: ${float(cost):.2f} ({percentage:.1f}%)\n"
    
    if recommendations:
        report += f"\nOPTIMIZATION RECOMMENDATIONS ({len(recommendations)} found):\n"
        
        for i, rec in enumerate(recommendations, 1):
            report += f"\n{i}. {rec['type'].replace('_', ' ').title()}\n"
            if 'resource' in rec:
                report += f"   Resource: {rec['resource']}\n"
            report += f"   Recommendation: {rec['recommendation']}\n"
            if 'potential_savings' in rec:
                report += f"   Potential Savings: {rec['potential_savings']}\n"
    else:
        report += "\nNo optimization recommendations found at this time.\n"
    
    report += f"\nNext analysis scheduled in 7 days.\n"
    
    return report

def send_notification(sns_client, topic_arn, report, project_name, environment):
    """Send cost optimization report via SNS"""
    
    subject = f"Cost Optimization Report - {project_name} ({environment})"
    
    try:
        sns_client.publish(
            TopicArn=topic_arn,
            Subject=subject,
            Message=report
        )
        print("Cost optimization report sent successfully")
    except Exception as e:
        print(f"Error sending notification: {str(e)}")