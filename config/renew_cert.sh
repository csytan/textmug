#!/bin/bash

# Add this entry to cron using "crontab -e"
# @monthly ~/textmug/config/renew_cert.sh

cd /home/csytan/https
python acme-tiny/acme_tiny.py --account-key ./account.key --csr ./domain.csr --acme-dir ./challenges/ > /tmp/signed.crt || exit
wget -O - https://letsencrypt.org/certs/lets-encrypt-x1-cross-signed.pem > intermediate.pem
cat /tmp/signed.crt intermediate.pem > ./chained.pem
sudo service nginx reload
