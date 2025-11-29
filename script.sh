INSTALL_DIR="$HOME/web-nas"

mkdir -p $INSTALL_DIR

echo "Installing web-nas to $INSTALL_DIR..."

git clone https://github.com/1REDfriend/web-nas.git $INSTALL_DIR

cd $INSTALL_DIR

npm install && npx prisma generate