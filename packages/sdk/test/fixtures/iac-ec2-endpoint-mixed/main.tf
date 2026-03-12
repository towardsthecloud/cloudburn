resource "aws_vpc_endpoint" "s3_private_link" {
  vpc_id            = "vpc-12345678"
  service_name      = "com.amazonaws.us-east-1.s3"
  vpc_endpoint_type = "Interface"
}
