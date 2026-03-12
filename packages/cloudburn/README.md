# cloudburn

Command-line interface for Cloudburn cloud cost optimization.

## Installation

```sh
npm install -g cloudburn
```

## Shell completion

Inspect the available completion subcommands:

```sh
cloudburn completion
cloudburn completion zsh --help
```

Generate a completion script for your shell and source it directly:

```sh
source <(cloudburn completion zsh)
source <(cloudburn completion bash)
cloudburn completion fish | source
```

To enable completion persistently, add one of the following lines to your shell config:

```sh
# ~/.zshrc
source <(cloudburn completion zsh)

# ~/.bashrc
source <(cloudburn completion bash)

# ~/.config/fish/config.fish
cloudburn completion fish | source
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
cloudburn discover
cloudburn discover --region all
cloudburn rules
cloudburn completion
cloudburn completion zsh
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
                "line": 4,
                "column": 3
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
