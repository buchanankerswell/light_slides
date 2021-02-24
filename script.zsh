#!/bin/zsh

# Load colors
autoload colors; colors;

# Matt's Optical petrography playlist
echo $fg_bold[green] "Matt's Optical petrography playlist:"
echo $fg_bold[green] "https://www.youtube.com/playlist?list=PL8dDgAwuMuPTXCj0MPO_G6jTz4pzXVcZi"

# Last script run (last download)
read -r lastdl < run-date.txt
echo $fg_bold[green] "downloading videos in .mp4 format and 480p"
echo $fg_bold[green] "starting new playlist download from (yyyymmdd): $lastdl"

# Getting youtube titles and urls
echo $fg_bold[green] "fetching youtube video titles after (yyyymmdd): $lastdl"
fname=("${(@f)$(youtube-dl --get-filename --dateafter $lastdl -o '%(title)s' PL8dDgAwuMuPTXCj0MPO_G6jTz4pzXVcZi --restrict-filenames)}")
url=("${(@f)$(youtube-dl -j --flat-playlist --dateafter $lastdl PL8dDgAwuMuPTXCj0MPO_G6jTz4pzXVcZi | jq -r '.id' | sed 's_^_https://youtu.be/_')}")
if [[ $fname ]]; then
  echo $fg_bold[green] "getting ${#fname} new videos:"
  printf $fg_bold[cyan] '%s\n' "${fname[@]}"
else
  echo $fg_bold[red] "no new videos"
  exit 1
fi

# Download playlist
youtube-dl --dateafter $lastdl -f 135 -i PL8dDgAwuMuPTXCj0MPO_G6jTz4pzXVcZi -o '%(title)s.%(ext)s' --restrict-filenames

# # Crop videos that are not square
# echo $fg_bold[green] "cropping videos that are not square to 1080x1080"
# for i in *.mp4; do
#   if [[ $(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=s=x:p=0 $i) !=
#         $(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=s=x:p=0 $i) ]]; then
#           echo $fg_bold[magenta] "cropping ${i%.*} to 1080x1080" &&
#           ffmpeg -i $i -filter:v "crop=1080:1080" -preset slow ${i%.*}_crop.mp4;
#   fi
# done
#
# # Remove "_crop" from filename
# rename -f 's/_crop//' *.mp4

# Get thumbnails for video poster image
echo $fg_bold[green] "extracting first frames for thumbnails"
for i in *.mp4; do
  echo $fg_bold[magenta] "extracting thumbnail for: ${i%.*}" &&
  ffmpeg -i $i -vf "select=eq(n\,0)" -q:v 3 ${i%.*}.jpg;
done

# Move to directory
echo $fg_bold[green] "moving files to appropriate directories"
mv *.jpg assets/images/posters/
mv *.mp4 assets/vids/

# Write markdown yaml's
echo $fg_bold[green] "writing pages"
for (( i = 1; i <= $#fname; i++ )) do (
  echo $fg_bold[magenta] "writing yaml for: ${fname[i]}"
  echo "---
title: ${fname[i]//_/ }
caption:
path-vid: assets/vids/${fname[i]}.mp4
path-poster: assets/images/posters/${fname[i]}.jpg
yt-url: '$url[i]'
---" > _images/$fname[i].md
)
done

# Print script run date
echo $fg_bold[green] "saving script run date +1 day for next download: $(date -v1d +%Y%m%d)"
echo $(date -v +1d +%Y%m%d) > run-date.txt
# Exit
echo $fg_bold[green] "done"
exit 1
