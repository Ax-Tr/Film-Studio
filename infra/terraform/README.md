# Film Studio — AWS Production Infrastructure (Terraform)

This directory contains automated Terraform Infrastructure-as-Code (IaC) to provision a secure, scalable production environment on **Amazon Web Services (AWS)**.

---

## 🏛️ Architecture Overview

* **VPC & Networking**: Multi-AZ Virtual Private Cloud with 2 public subnets (for ALB & NAT Gateway) and 2 private subnets (for containers & database).
* **Database**: Amazon RDS PostgreSQL 16 (`gp3`, encrypted at rest, Multi-AZ capable, SSL strictly enforced via custom parameter group).
* **Compute**: AWS ECS Fargate cluster running:
  * `backend` container service (port 4000)
  * `frontend` container service (port 3000)
* **Load Balancer**: Internet-facing Application Load Balancer (ALB) routing `/v1/*`, `/health`, and `/ready` to backend, and all page traffic to frontend.
* **Storage**: Amazon S3 bucket (`film-studio-assets-*`) with server-side AES-256 encryption, private access block, and CORS configuration.
* **Security & IAM**: Least-privilege IAM task execution roles and VPC Security Groups isolating database access exclusively to container tasks.

---

## 🚀 Deployment Steps

### 1. Prerequisites
* [Terraform CLI](https://developer.hashicorp.com/terraform/downloads) (>= 1.5.0) installed.
* [AWS CLI](https://aws.amazon.com/cli/) installed and authenticated (`aws configure`).
* Docker installed and running locally.

### 2. Build & Push Docker Images to Amazon ECR
Create your ECR repositories in your target region:
```bash
aws ecr create-repository --repository-name film-studio-backend --region ap-south-1
aws ecr create-repository --repository-name film-studio-frontend --region ap-south-1
```

Log in to ECR:
```bash
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com
```

Build and push the images using the provided Dockerfiles:
```bash
# Backend
docker build -f infra/docker/Dockerfile.backend -t <AWS_ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/film-studio-backend:latest .
docker push <AWS_ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/film-studio-backend:latest

# Frontend
docker build -f infra/docker/Dockerfile.frontend -t <AWS_ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/film-studio-frontend:latest .
docker push <AWS_ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/film-studio-frontend:latest
```

### 3. Configure Terraform Variables
Copy the example variable template:
```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
```
Edit `terraform.tfvars` with:
* Your RDS master password (`db_password`)
* Your ECR image URLs (`backend_image` and `frontend_image`)
* Your OIDC Identity Provider credentials (`oidc_issuer_url`, `oidc_client_id`, `oidc_client_secret`)
* Session signing secret (`app_session_secret`)

### 4. Initialize and Provision Infrastructure
```bash
terraform init
terraform plan
terraform apply -auto-approve
```

### 5. Run Database Migrations
Once the RDS PostgreSQL instance is provisioned, obtain its endpoint from Terraform outputs:
```bash
terraform output rds_endpoint
```
Run the migrations runner from the project root against the database endpoint:
```bash
DATABASE_URL="postgresql://filmstudio_admin:<DB_PASSWORD>@<RDS_ENDPOINT>/filmstudio?sslmode=require" pnpm db:migrate
```

### 6. Verify Deployment
Grab the public Application Load Balancer DNS name:
```bash
terraform output application_url
```
* Open the URL in your browser: `http://<ALB_DNS_NAME>/`
* Check API health: `http://<ALB_DNS_NAME>/health`
* Access Admin Console: `http://<ALB_DNS_NAME>/admin`

---

## 🧹 Tear Down (Destroy Resources)
When you no longer need the infrastructure, destroy all AWS resources to avoid incurring costs:
```bash
terraform destroy
```
