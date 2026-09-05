# cloudburn-ignore CLDBRN-AWS-EBS-1 retained for a compatibility test
resource "aws_ebs_volume" "legacy" {
  availability_zone = "us-east-1a"
  size              = 8
  type              = "gp2"
}
