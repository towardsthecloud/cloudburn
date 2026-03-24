resource "aws_dynamodb_table" "orders" {
  name = "orders"
}

resource "aws_appautoscaling_target" "orders_read" {
  resource_id        = "table/orders"
  scalable_dimension = "dynamodb:table:ReadCapacityUnits"
}

resource "aws_dynamodb_table" "logs" {
  name = "logs"
}
