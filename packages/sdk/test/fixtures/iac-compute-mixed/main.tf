resource "aws_eks_node_group" "workers" {
  cluster_name    = "production"
  node_group_name = "workers"
  ami_type        = "AL2023_x86_64_STANDARD"
  instance_types  = ["m7i.large"]
}
