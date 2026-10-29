# Guided portfolio preview

Public URL: https://d2pfmd74quf6lo.cloudfront.net/rasters/portfolio-preview/v1/index.html

This static page uses the existing portfolio interface gallery, clearly labelled as previews
with sample data. It does not require the full Flora app to run. The original working tree
and its uncommitted work are untouched.

Source assets: ../portfolio/public/projects/flora in the shared personal workspace.
The owner already publishes these through the portfolio gallery. assets.sha256 records the
exact images. Do not substitute Figma test baselines and call them live application data.

Publish only to the new rasters/portfolio-preview/v1/ prefix in the existing private raster
bucket, using its existing CloudFront OAC. No ACL, bucket-policy, distribution or app change.
Upload images to assets/ and index.html at the prefix root; use Cache-Control max-age=300
for the HTML and max-age=86400 for the existing image names. Do not use --delete.
Verify every image's SHA-256 before upload and every referenced URL through CloudFront.
To update screenshots, create a new versioned prefix rather than silently replacing old ones.

The source gallery is under another owned repository; it is intentionally not duplicated here.
Rollback is to stop linking to this versioned preview. Retained raster assets are unaffected.
