resource "aws_ebs_volume" "legacy" {
  availability_zone = "us-east-1a"
  size              = 8
  type              = "gp2"
}

resource "aws_ebs_volume" "current" {
  availability_zone = "us-east-1a"
  size              = 8
  type              = "gp3"
}
