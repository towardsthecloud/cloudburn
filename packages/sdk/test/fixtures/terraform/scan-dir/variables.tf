variable "volume_type" {
  type    = string
  default = "gp2"
}

resource "aws_ebs_volume" "var_backed" {
  availability_zone = "eu-west-1a"
  size              = 25
  type              = var.volume_type
}

resource "aws_instance" "web" {
  ami           = "ami-1234567890abcdef0"
  instance_type = "t3.micro"
}
