#!/bin/zsh

# remove old slides
if [ ! -z "$(ls _slides/*.md)" ]; then
  echo "replacing old slides with new ones"
  rm _slides/*.md
  rm assets/images/*.jpg
  rm assets/vids/*.mp4
fi

# Matt's Optical petrography playlist
echo "\nMatt's Optical petrography playlist:"
echo "https://www.youtube.com/playlist?list=PL8dDgAwuMuPTXCj0MPO_G6jTz4pzXVcZi"
echo "\ndownloading videos in .mp4 format and 480p"

# create array of comma separated random numbers to
# fetch n random videos from playlist
PLAYLIST="PL8dDgAwuMuPTXCj0MPO_G6jTz4pzXVcZi"
PLAYLIST_LENGTH=$(youtube-dl -J --flat-playlist ${PLAYLIST} | jq '.entries | length')
NVIDS=12
declare -a ivids
for (( i=1; i<=${NVIDS}; i++ )); do ivids[${i}]=$((1 + $RANDOM % ${PLAYLIST_LENGTH})); done
unset i
printf -v vidarray '%s,' "${ivids[@]}"

# get youtube titles and urls
echo "\nfetching ${NVIDS} random youtube video titles from playlist"
fname=("${(@f)$(youtube-dl --get-filename --restrict-filenames --playlist-items "${vidarray%,}" -o '%(title)s' ${PLAYLIST})}")
url=("${(@f)$(youtube-dl -j --flat-playlist --playlist-items "${vidarray%,}" ${PLAYLIST} | jq -r '.id' | sed 's_^_https://youtu.be/_')}")
if [[ $fname ]]; then
  echo "\ngetting ${#fname} videos:"
  printf '%s\n' "${fname[@]}"
  echo ""
fi

# download playlist
youtube-dl --restrict-filenames --playlist-items "${vidarray%,}" -f 135 -i ${PLAYLIST} -o '%(title)s.%(ext)s'

# crop videos that are not square
echo "\ncropping videos that are not square to 480x480"
for i in *.mp4; do
  if [[ $(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=s=x:p=0 ${i}) != $(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=s=x:p=0 ${i}) ]]; then
    echo "cropping ${i%.*} to 480x480"
    ffmpeg -i ${i} -filter:v "crop=480:480" -preset veryslow ${i%.*}_crop.mp4;
  else
    echo "${i} is square"
  fi
done
unset i

# remove "_crop" from filename
rename -f 's/_crop//' *.mp4

# get thumbnails for video poster image
echo "\nextracting first frames for thumbnails"
for i in *.mp4; do
  echo "extracting thumbnail for: ${i%.*}"
  ffmpeg -i ${i} -vf "select=eq(n\,0)" -q:v 3 ${i%.*}.jpg;
done
unset i

# move to directory
echo "\nmoving files to appropriate directories"
mv *.jpg assets/images/
mv *.mp4 assets/vids/

# Write markdown yaml's
echo "\nwriting markdown pages"
for (( i=1; i<=${#fname}; i++ )) do (
  echo "writing yaml for: ${fname[i]}"
  echo "---
title: ${fname[i]//_/ }
caption:
path-vid: 'assets/vids/${fname[i]}.mp4'
path-poster: 'assets/images/${fname[i]}.jpg'
yt-url: '$url[i]'
---" > _slides/$fname[i].md
)
done

# Exit
echo "\ndone!"
exit 1
