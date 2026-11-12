; Keep upgrades compatible with older installers whose atomic directory
; rename can return code 2 when a stale file handle or sync/indexer lock exists.
!macro customUnInstallCheck
  ${if} $R0 == 2
    DetailPrint "旧卸载器返回 code 2，继续执行直接文件清理。"
    Return
  ${endif}
  ${if} $R0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0"
    DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
    SetErrorLevel 2
    Quit
  ${endif}
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro customUnInstallCheck
!macroend

; Avoid the default atomic rename path for future upgrades/uninstalls. The
; installer itself runs outside $INSTDIR, so recursive removal is safe here.
!macro customRemoveFiles
  DetailPrint "正在清理旧版安装文件..."
  SetOutPath $TEMP
  RMDir /r "$INSTDIR"
!macroend
