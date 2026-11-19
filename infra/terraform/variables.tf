variable "aws_region" {
  description = "AWS region for all provisioned infrastructure (e.g. ap-south-1 for Mumbai, us-east-1 for N. Virginia)"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Deployment environment name (e.g. production, staging)"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Project identifier prefix used for naming resources"
  type        = string
  default     = "film-studio"
}

variable "vpc_cidr" {
  description = "CIDR block for the Virtual Private Cloud"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (ALB & NAT Gateways)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (ECS tasks & RDS database)"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.20.0/24"]
}

# ------------------------------------------------------------------------------
# Database Configuration
# ------------------------------------------------------------------------------

variable "db_name" {
  description = "PostgreSQL initial database name"
  type        = string
  default     = "filmstudio"
}

variable "db_username" {
  description = "Master username for Amazon RDS PostgreSQL"
  type        = string
  default     = "filmstudio_admin"
}

variable "db_password" {
  description = "Master password for Amazon RDS PostgreSQL"
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  description = "RDS instance class (db.t4g.micro for Free Tier/budget, db.t4g.medium for production)"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "Initial storage allocated for PostgreSQL in GB"
  type        = number
  default     = 20
}

# ------------------------------------------------------------------------------
# Containers & Application Configuration
# ------------------------------------------------------------------------------

variable "backend_image" {
  description = "Docker image URI for the Film Studio backend API"
  type        = string
  default     = "public.ecr.aws/docker/library/node:20-alpine"
}

variable "frontend_image" {
  description = "Docker image URI for the Film Studio frontend Next.js app"
  type        = string
  default     = "public.ecr.aws/docker/library/node:20-alpine"
}

variable "oidc_issuer_url" {
  description = "OpenID Connect issuer URL (AWS Cognito User Pool or Google OAuth)"
  type        = string
  default     = "https://accounts.google.com"
}

variable "oidc_client_id" {
  description = "OpenID Connect Client ID"
  type        = string
  default     = "film-studio-client"
}

variable "oidc_client_secret" {
  description = "OpenID Connect Client Secret"
  type        = string
  sensitive   = true
  default     = "change-me-in-production"
}

variable "app_session_secret" {
  description = "High-entropy 32+ character secret for session token signing and AES encryption"
  type        = string
  sensitive   = true
  default     = "film-studio-production-session-signing-secret-key-32chars"
}
