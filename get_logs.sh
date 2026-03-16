#!/bin/bash
# Find the pane running ./start-dev.sh and capture pane output
tmux capture-pane -t $(tmux list-panes -a -F '#{pane_id} #{pane_current_command}' | grep start-dev | awk '{print $1}') -p > logs.txt
tail -n 100 logs.txt
