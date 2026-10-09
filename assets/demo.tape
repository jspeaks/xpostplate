# Terminal demo for the README. Run scripts/demo.sh from the repo root: it records
# this tape with VHS, then ends both outputs on the PNG itself (chafa's preview is low-res).
# Needs vhs (brew install vhs) and chafa (brew install chafa) to draw the PNG in the terminal.
Output assets/demo.gif
Output assets/demo.mp4

Require xpostplate
Require chafa

Set Shell zsh
Set FontSize 18
Set Width 1200
Set Height 820
Set Padding 24
Set Theme "Builtin Dark"
Set TypingSpeed 25ms
Set CursorBlink false

Hide
Type "export PROMPT='$ ' RPROMPT='' && cd $(mktemp -d) && clear"
Enter
Show

Sleep 400ms
Type "xpostplate https://x.com/SpaceX/status/2106090316747207047 > post.png"
Sleep 600ms
Enter
Sleep 1.6s

Type "chafa -f symbols --size 72x30 post.png"
Sleep 400ms
Enter
Sleep 2.4s
