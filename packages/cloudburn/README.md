# cloudburn

Command-line interface for Cloudburn cloud cost optimization.

## Installation

```sh
npm install -g cloudburn
```

## Usage

```sh
cloudburn
```

Static scans auto-detect Terraform and CloudFormation from the file or
directory path you pass to `cloudburn scan`.

```sh
cloudburn scan ./main.tf
cloudburn scan ./template.yaml
cloudburn scan ./iac
cloudburn scan --live
```

`cloudburn scan --format json` emits the lean canonical grouped result:

```json
{
  "providers": [
    {
      "provider": "aws",
      "rules": [
        {
          "ruleId": "CLDBRN-AWS-EBS-1",
          "service": "ebs",
          "source": "iac",
          "message": "EBS volumes should use current-generation storage.",
          "findings": [
            {
              "resourceId": "aws_ebs_volume.gp2_data",
              "location": {
                "path": "main.tf",
                "startLine": 4,
                "startColumn": 3
              }
            }
          ]
        }
      ]
    }
  ]
}
```

## License

Apache-2.0
