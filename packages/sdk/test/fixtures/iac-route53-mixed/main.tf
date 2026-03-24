resource "aws_route53_health_check" "api" {
  fqdn = "api.example.com"
  type = "HTTPS"
}

resource "aws_route53_record" "api" {
  zone_id         = "Z1234567890ABC"
  name            = "api.example.com"
  type            = "A"
  records         = ["203.0.113.10"]
  ttl             = 300
  health_check_id = aws_route53_health_check.api.id
}
