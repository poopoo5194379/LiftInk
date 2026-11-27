!macro customInstall
  WriteRegStr SHCTX "Software\Classes\LiftInk.PDF.1" "" "LiftInk PDF annotation"
  WriteRegStr SHCTX "Software\Classes\LiftInk.PDF.1\DefaultIcon" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr SHCTX "Software\Classes\LiftInk.PDF.1\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --open-pdf "%1"'
  WriteRegStr SHCTX "Software\Classes\.pdf\OpenWithProgids" "LiftInk.PDF.1" ""
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegValue SHCTX "Software\Classes\.pdf\OpenWithProgids" "LiftInk.PDF.1"
  DeleteRegKey SHCTX "Software\Classes\LiftInk.PDF.1"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
