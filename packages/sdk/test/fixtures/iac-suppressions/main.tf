# cloudburn-ignore CLDBRN-AWS-EBS-1 legacy Terraform volume
resource "aws_ebs_volume" "suppressed" {
  availability_zone = "eu-west-1a"
  size              = 150
  type              = "gp2"
}

resource "aws_ebs_volume" "active" {
  availability_zone = "eu-west-1a"
  size              = 50
  type              = "gp2"
}
