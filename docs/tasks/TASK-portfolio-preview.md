# TASK-portfolio-preview

## 1. Current scenario
The full Flora app is intentionally stopped on EC2. Its CloudFront distribution already serves
private S3 raster assets under /rasters/*. A portfolio gallery of interface previews exists in
the owner's portfolio repository. The original Flora working tree has unrelated uncommitted
work; this task uses an isolated worktree and does not modify or deploy those changes.

## 2. Planned changes
Add a small, accessible guided interface preview with native anchor navigation and the existing
seven portfolio images. Label sample/interface data clearly; do not imply a working account or
live satellite refresh. Serve HTML and images from a new /rasters/portfolio-preview/v1/ prefix
through the existing private S3 origin and CloudFront OAC. No app server, new service, public
bucket policy, analytics, or additional third-party request is needed. Verify locally before
uploading and verify the public page and image responses afterwards.

## 3. Why
Give portfolio visitors a useful way to understand the fields → crop-health → task workflow
while the full app stays stopped. The preview uses existing assets; only HTML source and a
checksum inventory are added to this repository. Full raw event archives stay in S3 and are not
downloaded to the Mac.

## 4. Affected files
| File | Change |
|---|---|
| portfolio-preview/index.html | Guided interface preview |
| portfolio-preview/assets.sha256 | Existing portfolio image inventory |
| portfolio-preview/README.md | Publish, verification, source assets and rollback |
| README.md | Public preview link |
| docs/tasks/TASK-portfolio-preview.md | Plan and results |

## 5. Verification
Check every referenced local image against the checksum inventory; open the preview in Chrome
at desktop and mobile widths; check heading/link/image accessibility and no JavaScript errors.
After upload, page and all assets return 200 via CloudFront; the bucket remains private and
Flora's EC2 instance stays stopped. No existing raster is overwritten or deleted.

## 6. Out of scope
An interactive authenticated demo, changes to the full app, deployment of the original dirty
working tree, and fabrication of live farm/satellite/weather readings.

## Results (2026-10-29)
Desktop/mobile Chrome checks passed with all seven images loaded, zero page errors and no
horizontal overflow. Published HTML returns 200 through CloudFront and is byte-identical to
the tested source; all seven public image SHA-256 hashes match the inventory. The new prefix
was empty before publication. Flora's EC2 instance remains stopped. Original uncommitted work
was preserved in its separate working tree. Only the new static prefix was written.
