resource "aws_ebs_volume" "gp2_logs" {
  availability_zone = "eu-west-1a"
  size              = 50
  type              = "gp2"
}
