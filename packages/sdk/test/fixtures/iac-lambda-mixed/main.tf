resource "aws_lambda_function" "legacy" {
  function_name = "legacy"
  role          = "arn:aws:iam::123456789012:role/example"
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  filename      = "function.zip"
  architectures = ["x86_64"]
}
