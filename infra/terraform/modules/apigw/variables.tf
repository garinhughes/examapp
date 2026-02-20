variable "project" {
  type = string
}

variable "region" {
  type = string
}

variable "lambda_arn" {
  type = string
}

variable "lambda_function_name" {
  type = string
}

variable "stage_name" {
  type    = string
  default = "prod"
}

variable "api_name" {
  type    = string
  default = null
}

variable "resource_path" {
  type    = string
  default = "itemcount"
}
