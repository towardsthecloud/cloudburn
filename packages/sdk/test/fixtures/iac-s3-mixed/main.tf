resource "aws_s3_bucket" "missing_lifecycle" {
  bucket = "missing-lifecycle-bucket"
}

resource "aws_s3_bucket" "expire_only" {
  bucket = "expire-only-bucket"
}

resource "aws_s3_bucket_lifecycle_configuration" "expire_only" {
  bucket = aws_s3_bucket.expire_only.id

  rule {
    status = "Enabled"

    expiration {
      days = 30
    }
  }
}
