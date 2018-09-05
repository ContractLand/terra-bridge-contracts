#!/bin/bash

IC=contracts/installed
mkdir -p $IC


function github {
  echo $1 $3
  cd $4 ; curl -s https://raw.githubusercontent.com/$1/$2/$3 -O ; cd $OLDPWD
}

function erc827 {
  github \
    ContractLand/erc827 \
    master \
    $1 $2
}

erc827 contracts/ERC827.sol $IC
erc827 contracts/ERC827Token.sol $IC
