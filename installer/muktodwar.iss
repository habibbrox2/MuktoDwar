#define MyAppName "MuktoDwar"
#define MyAppVersion "1.1.4"
#define MyAppPublisher "MuktoDwar"
#define MyAppExeName "muktodwar.exe"

[Setup]
AppId={{B4F2A1C3-7D8E-4F9A-9B0C-1D2E3F4A5B6C}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
; The properties of the setup file itself, so that the installer says what
; it is and which version it is in the details of Windows Explorer.
VersionInfoVersion={#MyAppVersion}.0
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppName} Setup
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=..\build\installer
OutputBaseFilename=MuktoDwar-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\muktodwar.exe
UninstallDisplayName=MuktoDwar
SetupIconFile=..\assets\brand\muktodwar.ico
; The application is a 64-bit program, so the installer runs in 64-bit mode
; and {autopf} is the real Program Files, not Program Files (x86). The
; Windows Installer package does the same, so both installers put the
; application in the same place.
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\build\muktodwar.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\*"; DestDir: "{app}\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\src\ui\*"; DestDir: "{app}\ui"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\assets\brand\*"; DestDir: "{app}\assets\brand"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\assets\fonts\*"; DestDir: "{app}\assets\fonts"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\scripts\*"; DestDir: "{app}\scripts"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; A shortcut in the Start menu and one on the desktop, both pointing at
; the application. The desktop shortcut is not optional: installing the
; program and finding it on the desktop is what a user expects.
;
; The desktop shortcut goes to the common desktop, which is where the
; Windows Installer package puts it as well.
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{commondesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent runasoriginaluser