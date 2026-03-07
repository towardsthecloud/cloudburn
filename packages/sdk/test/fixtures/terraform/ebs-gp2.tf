resource "aws_ebs_volume" "gp2_data" {
  availability_zone = "eu-west-1a"
  size              = 100
  type              = "gp2"
}
