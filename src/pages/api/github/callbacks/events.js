export default function Handler(req, res) {
  console.log(req.body);
  res.status(200).json({ body: req.body });
}
