resource "aws_elasticache_cluster" "sessions" {
  cluster_id = "sessions"
  engine     = "redis"
  node_type  = "cache.m4.large"
}

resource "aws_elasticache_replication_group" "queue" {
  replication_group_id = "queue"
  node_type            = "cache.r7g.large"
}
