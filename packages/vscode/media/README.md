# README captures

These images show the packaged CloudBurn extension running the real, separately built CLI in VS Code 1.141.0
on macOS, using a temporary editor profile and disposable files. No AWS credentials or deployed resources were used.
HashiCorp HCL supplies Terraform syntax coloring; CloudBurn also works with plaintext Terraform without that extension.

The PNGs show two findings: one in each file below. The 8.3-second GIF shows Terraform with one remaining finding,
the selected `gp2` value, a manual edit to `gp3`, saving, and a completed scan with zero findings. The CloudFormation
volume was already changed to `gp3` before the GIF capture. Frames are real editor screenshots with display durations
chosen for readability. Only the native macOS title/tab bar was cropped; UI content and findings were not altered.

To refresh the captures, build and package the extension using the commands in the [extension README](../README.md).
Create a temporary VS Code profile, install the VSIX there, and open a disposable folder containing these fixtures.
Install the CLI separately, or use the README's local-build launcher settings. Trust only this fixture folder.
Use Dark Modern, an 18 px editor font, and hide the minimap and secondary sidebar. Run **CloudBurn: Scan Workspace**,
open Problems, and use **Show or Focus Hover** on the underlined property for the inline finding capture.

`.cloudburn.yml` selects the rule shown in the images:

```yaml
iac:
  enabled-rules: [CLDBRN-AWS-EBS-1]
```

`storage.tf`:

```hcl
# Check storage costs before you commit.

resource "aws_ebs_volume" "app_data" {
  availability_zone = "us-east-1a"
  size              = 100
  type              = "gp2"

  tags = {
    Name = "app-data"
  }
}
```

`template.yaml`:

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: Storage for the application

Resources:
  AppData:
    Type: AWS::EC2::Volume
    Properties:
      AvailabilityZone: us-east-1a
      Size: 100
      VolumeType: gp2
      Tags:
        - Key: Name
          Value: app-data
```
