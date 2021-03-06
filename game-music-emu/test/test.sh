#!/bin/sh

# A simple script to help test whether libgme changes affect the output of the
# emulators using it.
#
# Idea is to run under a test directory (the directory holding this script),
# which itself has subdirectories:
#   "cur" (for outputs from the current libgme) and
#   "new" (for outputs from the new version we're testing)
#
# These hold the output of a version of the existing libgme 'demo' script,
# modified to take 2 argments (input file, output file) and to output 3 minutes
# worth of music (to account for looping tracks).  Just run 'make' to build the
# script.
#
# This script compares the 2 output files generated by each run of the modified
# demo script, and outputs a warning if the 2 were different.  In this case the
# output files are also left intact for post-test examination.
#
# LD_PRELOAD is used to control which libgme is run (LD_PRELOAD is unset to
# pull in the default libgme, set to $LIBGME_NEW_PATH to pull in the new one)
#
# Sample usage (with GNU parallel to use all your cores)
#   parallel --bar ./test {} ::: ../test.nsf ~/Music/*.{spc,gym}
#
# Feel free to replace the files listed above with the path(s) to your own
# files.

# Path to the build directory's libgme, which we want to test
# The part after the := below is just the default to use if unset
LIBGME_NEW_PATH=${LIBGME_NEW_PATH:=$(realpath ../build/gme/libgme.so)} :

if [ "$#" -lt 1 ]
then
    printf "This doesn't work on empty input!\n"
    exit 1
fi

i="$1"

filepath=$(realpath "$i")

if [ ! -e "$filepath" ]
then
    printf "File $i does not exist!\n"
    exit 1
fi

outname=$(basename "$filepath").out

# Ensure directories present
mkdir -p cur new curm newm

(cd cur ; ../demo "$filepath" "$outname")
(cd new ; LD_PRELOAD="$LIBGME_NEW_PATH" ../demo "$filepath" "$outname")

(cd curm ; ../demo_mem "$filepath" "$outname")
(cd newm ; LD_PRELOAD="$LIBGME_NEW_PATH" ../demo_mem "$filepath" "$outname")

out1=$(sha1sum cur/"$outname" | cut -f1 -d' ')
out2=$(sha1sum new/"$outname" | cut -f1 -d' ')

out1m=$(sha1sum curm/"$outname" | cut -f1 -d' ')
out2m=$(sha1sum newm/"$outname" | cut -f1 -d' ')

if [ "x$out1" = "x$out2" -a "x$out1m" = "x$out2m" -a "x" != "x$out1" -a "x" != "x$out1m" ]
then
    rm cur/"$outname"
    rm new/"$outname"
    rm curm/"$outname"
    rm newm/"$outname"
    printf "All checks has been passed!\n"
    exit 0
else
    printf "$outname differed\n"
    exit 1
fi
