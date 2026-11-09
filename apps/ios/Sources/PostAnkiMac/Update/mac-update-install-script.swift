import Foundation

enum MacUpdateInstallScript {
    static func quote(_ value: String) -> String {
        "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }

    static func render(pid: Int32, newApp: String, installedApp: String) -> String {
        let new = quote(newApp)
        let installed = quote(installedApp)
        let aside = quote(installedApp + ".old")

        return """
        #!/bin/sh
        while kill -0 \(pid) 2>/dev/null; do sleep 0.2; done
        rm -rf \(aside)
        if mv \(installed) \(aside); then
          if ditto \(new) \(installed); then
            rm -rf \(aside)
          else
            rm -rf \(installed)
            mv \(aside) \(installed)
          fi
        fi
        open \(installed)
        """
    }
}
