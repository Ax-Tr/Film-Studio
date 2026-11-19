output "alb_dns_name" {
  description = "Public Application Load Balancer DNS hostname"
  value       = aws_lb.main.dns_name
}

output "application_url" {
  description = "Main entry URL for Film Studio web application"
  value       = "http://${aws_lb.main.dns_name}"
}

output "rds_endpoint" {
  description = "PostgreSQL RDS connection endpoint"
  value       = aws_db_instance.postgres.endpoint
}

output "database_url_template" {
  description = "PostgreSQL connection string template with SSL enabled"
  value       = "postgresql://${var.db_username}:<DB_PASSWORD>@${aws_db_instance.postgres.endpoint}/${var.db_name}?sslmode=require"
  sensitive   = false
}

output "s3_assets_bucket" {
  description = "Name of the S3 bucket provisioned for assets"
  value       = aws_s3_bucket.assets.id
}

output "ecs_cluster_name" {
  description = "Name of the provisioned ECS cluster"
  value       = aws_ecs_cluster.main.name
}
