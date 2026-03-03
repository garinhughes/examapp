variable "project" {
  type    = string
  default = "examapp"
}

variable "ecs_task_execution_role_arn" {
  description = "ARN of ECS task execution role for Secrets Manager access"
  type        = string
}
