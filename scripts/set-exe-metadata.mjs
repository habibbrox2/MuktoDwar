/**
 * Give the executable the identity of the product.
 *
 * The Windows executable is a copy of the Node.js binary with the
 * application injected into it, so out of the box it calls itself
 * "Node.js JavaScript Runtime", reports the Node.js version and shows the
 * Node.js icon. A user who installs MuktoDwar should not find Node.js
 * written all over the place: the icon in the taskbar, the shortcut on
 * the desktop and the file properties all have to say MuktoDwar.
 *
 * resedit writes both the icon and the version resource into the
 * executable. It is run after the application blob has been injected,
 * because that is the last step that rewrites the file.
 *
 * The version comes from package.json, the same place the runtime, the
 * installers and the documentation take it from.
 */

import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as ResEdit from 'resedit';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exePath = join(root, 'build', 'muktodwar.exe');
const iconPath = join(root, 'assets', 'brand', 'muktodwar.ico');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// ignoreCert: the Node.js binary is signed, and a file that has been
// changed cannot keep that signature anyway. Leaving the certificate
// table in place would only make Windows complain about an invalid
// signature.
const exe = ResEdit.NtExecutable.from(readFileSync(exePath), { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(exe);

// 1. The icon.
//
// The icon file holds 16, 24, 32, 48 and 256 pixel versions of the
// MuktoDwar mark, which is what Windows asks for at the different sizes.
// The group that is already in the executable is replaced, so the file
// keeps the same icon reference.
const iconFile = ResEdit.Data.IconFile.from(readFileSync(iconPath));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const groupId = groups.length > 0 ? groups[0].id : 101;

ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
  res.entries,
  groupId,
  1033,
  iconFile.icons.map((item) => item.data),
);

// 2. The version information.
//
// Without this the file properties of the installed executable say
// "Node.js JavaScript Runtime" and show the Node.js version, which is
// both wrong and confusing next to a program called MuktoDwar.
const infos = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
const info = infos[0];

if (info) {
  const [major, minor, patch] = version.split('.').map(Number);

  info.setFileVersion(major, minor, patch, 0, 1033);
  info.setProductVersion(major, minor, patch, 0, 1033);
  info.setStringValues(
    { lang: 1033, codepage: 1200 },
    {
      FileDescription: 'MuktoDwar - local AI gateway for Windows',
      ProductName: 'MuktoDwar',
      CompanyName: 'MuktoDwar',
      LegalCopyright: 'MuktoDwar',
      OriginalFilename: 'muktodwar.exe',
      InternalName: 'muktodwar',
    },
  );
  info.outputToResourceEntries(res.entries);
}

res.outputResource(exe);

// Written to a temporary file first: resedit asks that the destination
// is not the file it read from.
const temporary = `${exePath}.new`;
writeFileSync(temporary, Buffer.from(exe.generate()));
renameSync(temporary, exePath);

console.log(`Set the icon and the version information (${version}) on ${exePath}`);
