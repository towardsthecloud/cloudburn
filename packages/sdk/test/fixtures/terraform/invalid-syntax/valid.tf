resource "aws_ebs_volume" "gp2_sibling" {
  availability_zone = "eu-west-1a"
  size              = 25
  type              = "gp2"
}
