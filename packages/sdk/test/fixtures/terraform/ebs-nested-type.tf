resource "aws_ebs_volume" "nested_type" {
  tags = {
    type = "important"
  }

  availability_zone = "eu-west-1a"
  size              = 100
  type              = "gp2"
}
