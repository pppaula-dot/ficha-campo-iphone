FICHA CAMPO - IPHONE PWA v0.1

Objetivo
- Versão simples para o único usuário de iPhone da equipe.
- Mantém o Android separado e inalterado.
- Reaproveita a mesma interface HTML e o mesmo formato .ficha do Android.

Funcionalidades desta base
- Funcionamento offline depois de instalada/carregada.
- Importação de arquivos .ficha ou pacote .zip de fichas pelo app Arquivos (incluindo Google Drive quando disponível no Arquivos).
- Fotos por item/subitem/ponto, com câmera ou biblioteca.
- Seleção de fotos para relatório do cliente.
- Áudio por item.
- GPS somente quando o usuário toca em Capturar GPS.
- Conversão para UTM 24S feita pelo mesmo código da versão Android.
- Salvamento local da ficha.
- Relatório interno com todas as fotos.
- Relatório do cliente sem fotos.
- Relatório do cliente com fotos selecionadas.
- ZIP de fotos e áudios.
- ZIP da ficha completa com JSON + 3 relatórios + fotos + áudios.

Instalação no iPhone
1. Estes arquivos precisam estar publicados em um endereço HTTPS (GitHub Pages pode ser usado gratuitamente).
2. Abrir o endereço no Safari do iPhone.
3. Compartilhar > Adicionar à Tela de Início.
4. Abrir pelo ícone Ficha Campo.
5. Na primeira utilização de câmera, microfone e localização, permitir o acesso solicitado pelo iPhone.

Observação importante
- Não exige Mac, Xcode nem Apple Developer.
- Para o modo instalado/offline funcionar corretamente no iPhone, o endereço deve ser HTTPS; abrir apenas o arquivo index.html diretamente pelo app Arquivos não substitui a instalação PWA.
