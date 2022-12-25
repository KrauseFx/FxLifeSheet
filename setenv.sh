#!/usr/bin/env bash

# Show env vars
grep -v '^#' .env

# Export env vars
export $(grep -v '^#' .env | xargs)
