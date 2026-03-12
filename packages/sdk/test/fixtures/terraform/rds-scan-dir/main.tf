resource "aws_db_instance" "legacy" {
  allocated_storage = 100
  engine            = "postgres"
  instance_class    = "db.m6i.large"
}

resource "aws_db_instance" "current" {
  allocated_storage = 100
  engine            = "postgres"
  instance_class    = "db.m8g.large"
}
