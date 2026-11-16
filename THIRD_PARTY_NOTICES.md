# Third-party notices

Job Lock's own code is under the MIT License (see `LICENSE`). It depends on
third-party software under its own licenses. The full dependency list is in the
`package.json` files and `bun.lock`; each package's license ships with it in
`node_modules`. The components below are called out because their licenses are
copyleft.

## FFmpeg (LGPL-2.1-or-later / GPL-2.0-or-later)

`packages/web/vite/__plugins/asset-optimizer-plugin.ts` can re-encode videos in
the build output by running the `ffmpeg` command-line program, if one is
installed on the machine doing the build. FFmpeg is **not** included in this
repository, not installed by `bun install`, not linked into the app and not
shipped with it: it is run as a separate program, and the build simply skips
video re-encoding when it is absent. The encoder it asks for (`libx264`) is only
present in FFmpeg builds configured with `--enable-gpl`, which are licensed
under the GPL.

FFmpeg is a trademark of Fabrice Bellard and is developed by the FFmpeg project:
https://ffmpeg.org. Its licensing terms: https://ffmpeg.org/legal.html.

## sharp / libvips (Apache-2.0 / LGPL-3.0-or-later)

The same build plugin compresses images with `sharp` (Apache-2.0), a dev
dependency whose prebuilt binaries bundle libvips and other libraries under
LGPL-3.0-or-later. They are used only at build time and are not shipped in the
deployed app. Details: https://sharp.pixelplumbing.com and
https://github.com/lovell/sharp-libvips.
