!macro customInstall
  # Updates preserve missing shortcuts by default. Restore our notification
  # identity even when an earlier installation lost its Start Menu entry.
  !insertmacro createMenuDirectory
  CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
  WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\AppUserModelId\${APP_ID}" "DisplayName" "T3 Pet"
  WriteRegStr SHELL_CONTEXT "Software\Classes\AppUserModelId\${APP_ID}" "IconUri" "$INSTDIR\resources\icon.ico"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  DeleteRegKey SHELL_CONTEXT "Software\Classes\AppUserModelId\${APP_ID}"
!macroend
