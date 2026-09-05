resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    id     = "expire"
    status = "Enabled"
    expiration { days = 30 }
  }
}
