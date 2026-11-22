#!/bin/bash
# Usage: install.sh install | uninstall | check
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
SUPPORT_DIR="$HOME/Library/Application Support/PostAnki"
INSTALLED_SCRIPT="$SUPPORT_DIR/send-selection.sh"
TOKEN_COMMAND_FILE="$SUPPORT_DIR/token-command"
WORKFLOW="$HOME/Library/Services/Send to Post Anki.workflow"

write_workflow() {
  mkdir -p "$WORKFLOW/Contents"

  cat >"$WORKFLOW/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSServices</key>
	<array>
		<dict>
			<key>NSMenuItem</key>
			<dict>
				<key>default</key>
				<string>Send to Post Anki</string>
			</dict>
			<key>NSMessage</key>
			<string>runWorkflowAsService</string>
			<key>NSSendTypes</key>
			<array>
				<string>public.utf8-plain-text</string>
				<string>NSStringPboardType</string>
			</array>
		</dict>
	</array>
</dict>
</plist>
PLIST

  cat >"$WORKFLOW/Contents/document.wflow" <<'WFLOW'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>AMApplicationBuild</key>
	<string>523</string>
	<key>AMApplicationVersion</key>
	<string>2.10</string>
	<key>AMDocumentVersion</key>
	<string>2</string>
	<key>actions</key>
	<array>
		<dict>
			<key>action</key>
			<dict>
				<key>AMAccepts</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Optional</key>
					<true/>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.string</string>
					</array>
				</dict>
				<key>AMActionVersion</key>
				<string>2.0.3</string>
				<key>AMApplication</key>
				<array>
					<string>Automator</string>
				</array>
				<key>AMParameterProperties</key>
				<dict>
					<key>COMMAND_STRING</key>
					<dict/>
					<key>CheckedForUserDefaultShell</key>
					<dict/>
					<key>inputMethod</key>
					<dict/>
					<key>shell</key>
					<dict/>
					<key>source</key>
					<dict/>
				</dict>
				<key>AMProvides</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.string</string>
					</array>
				</dict>
				<key>ActionBundlePath</key>
				<string>/System/Library/Automator/Run Shell Script.action</string>
				<key>ActionName</key>
				<string>Run Shell Script</string>
				<key>ActionParameters</key>
				<dict>
					<key>COMMAND_STRING</key>
					<string>"$HOME/Library/Application Support/PostAnki/send-selection.sh"</string>
					<key>CheckedForUserDefaultShell</key>
					<true/>
					<key>inputMethod</key>
					<integer>0</integer>
					<key>shell</key>
					<string>/bin/bash</string>
					<key>source</key>
					<string></string>
				</dict>
				<key>BundleIdentifier</key>
				<string>com.apple.RunShellScript</string>
				<key>CFBundleVersion</key>
				<string>2.0.3</string>
				<key>CanShowSelectedItemsWhenRun</key>
				<false/>
				<key>CanShowWhenRun</key>
				<true/>
				<key>Category</key>
				<array>
					<string>AMCategoryUtilities</string>
				</array>
				<key>Class Name</key>
				<string>RunShellScriptAction</string>
				<key>InputUUID</key>
				<string>5C6E7A10-2B1A-4C47-9A0B-1E4D6A9C0001</string>
				<key>OutputUUID</key>
				<string>5C6E7A10-2B1A-4C47-9A0B-1E4D6A9C0002</string>
				<key>UUID</key>
				<string>5C6E7A10-2B1A-4C47-9A0B-1E4D6A9C0003</string>
				<key>arguments</key>
				<dict/>
			</dict>
		</dict>
	</array>
	<key>connectors</key>
	<dict/>
	<key>workflowMetaData</key>
	<dict>
		<key>serviceInputTypeIdentifier</key>
		<string>com.apple.Automator.text</string>
		<key>serviceOutputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>serviceProcessesInput</key>
		<integer>0</integer>
		<key>workflowTypeIdentifier</key>
		<string>com.apple.Automator.servicesMenu</string>
	</dict>
</dict>
</plist>
WFLOW
}

case "${1:-}" in
  install)
    mkdir -p "$SUPPORT_DIR"
    cp "$HERE/send-selection-to-postanki.sh" "$INSTALLED_SCRIPT"
    chmod 700 "$INSTALLED_SCRIPT"
    write_workflow
    /System/Library/CoreServices/pbs -update
    echo "Installed. Create $TOKEN_COMMAND_FILE (mode 600) with a one-line command that prints your token."
    ;;
  uninstall)
    case "$WORKFLOW" in
      *"/Send to Post Anki.workflow") rm -r "$WORKFLOW" 2>/dev/null || true ;;
    esac
    rm -f "$INSTALLED_SCRIPT"
    /System/Library/CoreServices/pbs -update
    echo "Removed the Quick Action and the installed script."
    ;;
  check)
    if [ ! -f "$TOKEN_COMMAND_FILE" ]; then
      echo "Token command file is missing: $TOKEN_COMMAND_FILE"
      exit 1
    fi

    MODE="$(/usr/bin/stat -f '%Lp' "$TOKEN_COMMAND_FILE")"

    if [ "$MODE" != "600" ]; then
      echo "Token command file mode is $MODE, expected 600."
      exit 1
    fi

    echo "Token command file is present and private."
    ;;
  *)
    echo "Usage: $0 install | uninstall | check" >&2
    exit 2
    ;;
esac
