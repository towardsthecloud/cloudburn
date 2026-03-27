resource "aws_api_gateway_stage" "prod" {
  rest_api_id           = "a1b2c3d4"
  stage_name            = "prod"
  cache_cluster_enabled = false
}

resource "aws_cloudfront_distribution" "cdn" {
  enabled = true
}
