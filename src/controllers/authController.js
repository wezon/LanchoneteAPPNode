const mongoose = require("mongoose");
const User = mongoose.model("User");
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const TokenResetSenha = mongoose.model("TokenResetSenha");
require("dotenv").config();

function gerarToken(user = {}) {
  return jwt.sign({ id: user.id }, process.env.SECRET, {
    expiresIn: 86400
  });
}
function generateToken() {
  var buf = new Buffer(6);
  for (var i = 0; i < buf.length; i++) {
    buf[i] = Math.floor(Math.random() * 256);
  }
  var id = buf.toString("base64").toString('ascii');
  return id;
}
exports.get = (req, res, next) => {
  User.find()
    .then(data => {
      res.status(201).send(data);
    })
    .catch(e => {
      return res.status(400).send({
        Mensagem: "Erro ao listar  os usuarios",
        Data: e
      });
    });
};
exports.post = (req, res, next) => {
  var user = new User(req.body);
  user
    .save()
    .then(x => {
      res.status(201).send({
        user,
        token: gerarToken({ user: user })
      });
    })
    .catch(e => {
      return res.status(400).send({
        Mensagem: "Erro ao cadastrar o usuario",
        Data: e
      });
    });
};
exports.auth = async (req, res, next) => {
  const { login, senha } = req.body;
  const user = await User.findOne({ login } || "")
    .select("+senha")
    .catch(e => {
      return res.status(400).send({
        Mensagem: "Erro ao autenticar o usuário",
        Data: e
      });
    });
  if (!user) return res.status(400).send({ error: "Usuario não encontrado" });
  if (!(await bcryptjs.compare(senha || "", user.senha)))
    return res.status(400).send({ error: "Senha inválida" });

  user.senha = undefined;

  return res.status(200).send({ user, token: gerarToken({ user: user }) });
};

exports.atualizaToken = async (req, res, next) => {
  const { login } = req.body;

  const user = await User.findOne({ login } || "").catch(e => {
    return res.status(400).send({
      Mensagem: "Erro ao encontrar o usuário",
      Data: e
    });
  });
  if (!user)
    return res.status(400).send({ error: "Erro ao encontrar o usuário" });
  return res.status(200).send({ user, token: gerarToken({ user: user }) });
};

exports.enviaEmailConfirmacao = async (req, res, next) => {
  const { login, email } = req.body;
  var dataExpiracao = new Date();
  var id;
  dataExpiracao.setMinutes(dataExpiracao.getMinutes() + 30);
  dataExpiracao = new Date(dataExpiracao);

  if (!login || !email)
    return res.status(400).send({ error: "Login ou Email não informados" });
  const user = await User.findOne({ login, email }).catch(e => {
    return res.status(400).send({
      error: e
    });
  });
  if (!user) 
    return res.status(400).send({ error: "Usuário não encontrado" });
  var tokenResetSenha = await TokenResetSenha.findOne({
    login,
    dataExpiracao: { $gte: new Date() }
  }).catch(e => {
    return res.status(400).send({
      error: e
    });
  });
  if (!tokenResetSenha) {
    var novoTokenResetSenha = new TokenResetSenha();
    novoTokenResetSenha.dataExpiracao = dataExpiracao;
    novoTokenResetSenha.login = login;
    novoTokenResetSenha.token = generateToken();
    novoTokenResetSenha = await novoTokenResetSenha.save().catch(e => {
      return res.status(400).send({
        error: e
      });
    });
    id = novoTokenResetSenha.token;
    console.log("gerou novo:" + id);
  } else {
    id = tokenResetSenha.token;
    console.log("nao gerou novo:" + id);
  }

  const transporter = nodemailer.createTransport({
    service: process.env.SERVICE_EMAIL,
    auth: {
      user: process.env.EMAIL,
      pass: process.env.SENHA_EMAIL
    }
  });

  const conteudoEmail = {
    from: process.env.EMAIL,
    to: email,
    subject: "Reset de Senha",
    text: "Mensagem automatica de reset de senha -- Token: " + id
  };
  transporter.sendMail(conteudoEmail, err => {
    if (err) return res.status(400).send({ error: err });
    return res.status(200).send({ Mensagem: "Mensagem enviada com sucesso" });
  });
};
exports.verificaCodigoResetSenha = async (req, res, next) => {
  const { token, login, senha } = req.body;
  const tokenResetSenha = await TokenResetSenha.findOne(
    { token, login } || ""
  ).catch(e => {
    return res.status(400).send({
      error: e
    });
  });
  if (!tokenResetSenha)
    return res.status(400).send({ error: "Código não encontrado" });

  if (new Date(tokenResetSenha.dataExpiracao) < new Date())
    return res.status(400).send({ error: "Token Expirou" });

  const user = await User.updateOne(
    { login },
    { $set: { senha: senha } }
  ).catch(e => {
    return res.status(400).send({
      error: e
    });
  });

  if (!user)
    return res.status(400).send({ error: "Erro ao encontrar o usuário" });
  await TokenResetSenha.deleteOne(tokenResetSenha)
  .catch(e => {
    return res.status(400).send({
      error: e
    });
  });
  return res.status(200).send({ Mensagem: "Senha alterada com sucesso" });
};
