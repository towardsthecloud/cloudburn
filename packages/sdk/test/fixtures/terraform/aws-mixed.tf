resource "aws_instance" "web" {
  ami           = "ami-1234567890abcdef0"
  instance_type = "t3.micro"
  tags = {
    instance_type = "not-the-top-level-field"
  }
}

resource "aws_s3_bucket" "logs" {
  bucket = "cloudburn-access-logs"
}

resource "random_id" "suffix" {
  byte_length = 8
}
