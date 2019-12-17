@echo off

FOR /F "tokens=* USEBACKQ" %%F IN (`ipconfig`) DO (
SET var=%%F
)

SET ip=%var:~35%
ECHO host ip is: %ip%

(
echo #Internal workaround
echo %ip% host.docker.internal
echo # End of section
)>>"C:\windows\system32\drivers\etc\hosts"

node docker_stats_exporter.js